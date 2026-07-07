#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any


def write_answer(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="wtfOS apphost GStreamer WebRTC streamer")
    parser.add_argument("--offer", type=Path, required=True)
    parser.add_argument("--answer", type=Path, required=True)
    parser.add_argument("--display", required=True)
    parser.add_argument("--pulse-server", default="")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--framerate", type=int, default=24)
    parser.add_argument("--stream-id", required=True)
    parser.add_argument("--ice-wait-ms", type=int, default=1800)
    parser.add_argument("--stats", type=Path, default=None)
    return parser.parse_args()


def quote_gst(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def offered_payload_type(sdp: str, media: str, codec: str, fallback: int) -> int:
    in_media = False
    codec_name = codec.lower()
    for raw_line in sdp.splitlines():
        line = raw_line.strip()
        if line.startswith("m="):
            in_media = line.startswith(f"m={media} ")
            continue
        if not in_media or not line.startswith("a=rtpmap:"):
            continue
        payload, _, encoding = line[len("a=rtpmap:") :].partition(" ")
        encoding_name = encoding.split("/", 1)[0].lower()
        if encoding_name != codec_name:
            continue
        try:
            return int(payload)
        except ValueError:
            return fallback
    return fallback


def main() -> int:
    args = parse_args()
    offer_payload = json.loads(args.offer.read_text(encoding="utf-8"))
    offer = offer_payload.get("offer") if isinstance(offer_payload, dict) else None
    if not isinstance(offer, dict) or offer.get("type") != "offer" or not isinstance(offer.get("sdp"), str):
        write_answer(args.answer, {"ok": False, "error": "Invalid WebRTC offer"})
        return 2

    try:
        import gi  # type: ignore[import-not-found]

        gi.require_version("Gst", "1.0")
        gi.require_version("GstSdp", "1.0")
        gi.require_version("GstWebRTC", "1.0")
        from gi.repository import GLib, Gst, GstSdp, GstWebRTC  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001 - returned to apphost diagnostics
        write_answer(
            args.answer,
            {
                "ok": False,
                "error": "GStreamer WebRTC Python bindings are unavailable",
                "detail": str(exc),
            },
        )
        return 3

    Gst.init(None)
    os.environ["DISPLAY"] = args.display
    if args.pulse_server:
        os.environ["PULSE_SERVER"] = args.pulse_server

    loop = GLib.MainLoop()
    candidates: list[dict[str, Any]] = []
    answer_written = {"value": False}
    local_answer: dict[str, str] = {}

    audio_required = bool((offer_payload.get("audio") or {}).get("required")) if isinstance(offer_payload, dict) else False
    audio_payload_type = offered_payload_type(offer["sdp"], "audio", "opus", 111)
    width = max(320, min(7680, int(args.width)))
    height = max(240, min(4320, int(args.height)))
    framerate = max(15, min(60, int(args.framerate)))
    keyframe_max_dist = max(framerate, min(framerate * 2, 60))
    video_chain = (
        # show-pointer=true streams the application's native cursor; the client
        # hides its local cursor over the play surface so only the game cursor
        # is visible and game-driven cursor changes (hover states) are preserved.
        f'ximagesrc display-name="{quote_gst(args.display)}" use-damage=false show-pointer=true '
        f"! video/x-raw,framerate={framerate}/1 "
        f"! videoconvert ! videoscale ! video/x-raw,width={width},height={height} "
        "! queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream "
        f"! vp8enc deadline=1 cpu-used=8 threads=2 keyframe-max-dist={keyframe_max_dist} "
        "auto-alt-ref=false error-resilient=0 "
        "! identity name=encodedtap silent=true "
        "! rtpvp8pay pt=96 "
        "! application/x-rtp,media=video,encoding-name=VP8,payload=96 "
        "! webrtc."
    )
    audio_chain = ""
    if audio_required and args.pulse_server:
        audio_chain = (
            f' pulsesrc server="{quote_gst(args.pulse_server)}" '
            "! audioconvert ! audioresample ! audio/x-raw,rate=48000,channels=2 "
            "! queue max-size-buffers=8 leaky=downstream "
            "! opusenc inband-fec=true "
            f"! rtpopuspay pt={audio_payload_type} "
            f"! application/x-rtp,media=audio,encoding-name=OPUS,payload={audio_payload_type},clock-rate=48000,encoding-params=(string)2 "
            "! webrtc."
        )
    pipeline_description = f"webrtcbin name=webrtc bundle-policy=max-bundle {video_chain}{audio_chain}"

    try:
        pipeline = Gst.parse_launch(pipeline_description)
    except Exception as exc:  # noqa: BLE001 - returned to apphost diagnostics
        write_answer(
            args.answer,
            {
                "ok": False,
                "error": "Could not create GStreamer WebRTC pipeline",
                "detail": str(exc),
                "pipeline": pipeline_description,
            },
        )
        return 4

    webrtc = pipeline.get_by_name("webrtc")
    if webrtc is None:
        write_answer(args.answer, {"ok": False, "error": "GStreamer pipeline did not create webrtcbin"})
        return 5

    stats_path = args.stats if args.stats is not None else args.answer.with_name("stats.json")
    started_monotonic = time.monotonic()
    encode_counters = {"frames": 0, "bytes": 0, "lastFrames": 0, "lastBytes": 0, "lastAt": started_monotonic}
    counters_lock = threading.Lock()

    def on_encoded_buffer(_pad: Any, info: Any) -> Any:
        buffer = info.get_buffer()
        with counters_lock:
            encode_counters["frames"] += 1
            if buffer is not None:
                encode_counters["bytes"] += buffer.get_size()
        return Gst.PadProbeReturn.OK

    encoded_tap = pipeline.get_by_name("encodedtap")
    if encoded_tap is not None:
        tap_pad = encoded_tap.get_static_pad("src")
        if tap_pad is not None:
            tap_pad.add_probe(Gst.PadProbeType.BUFFER, on_encoded_buffer)

    def write_stats() -> bool:
        now = time.monotonic()
        with counters_lock:
            frames = encode_counters["frames"]
            total_bytes = encode_counters["bytes"]
            window_seconds = max(0.001, now - encode_counters["lastAt"])
            window_frames = frames - encode_counters["lastFrames"]
            window_bytes = total_bytes - encode_counters["lastBytes"]
            encode_counters["lastFrames"] = frames
            encode_counters["lastBytes"] = total_bytes
            encode_counters["lastAt"] = now
        payload = {
            "ok": True,
            "streamId": args.stream_id,
            "uptimeSeconds": round(now - started_monotonic, 1),
            "video": {
                "width": width,
                "height": height,
                "targetFramerate": framerate,
                "framesEncoded": frames,
                "encodeFps": round(window_frames / window_seconds, 1),
                "encodeKbps": round(window_bytes * 8 / window_seconds / 1000, 1),
            },
            "audio": {"enabled": bool(audio_chain)},
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        try:
            write_answer(stats_path, payload)
        except OSError:
            pass
        return True

    GLib.timeout_add_seconds(2, write_stats)

    def finish_answer() -> bool:
        if answer_written["value"] or not local_answer:
            return False
        answer_written["value"] = True
        write_answer(
            args.answer,
            {
                "ok": True,
                "streamId": args.stream_id,
                "transport": "webrtc",
                "answer": local_answer,
                "candidates": candidates,
                "video": {"width": width, "height": height, "codec": "VP8", "framerate": framerate},
                "audio": {"enabled": bool(audio_chain), "codec": "OPUS" if audio_chain else None, "payloadType": audio_payload_type if audio_chain else None},
                "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
        return False

    def on_ice_candidate(_element: Any, mline_index: int, candidate: str) -> None:
        candidates.append({"candidate": candidate, "sdpMLineIndex": int(mline_index)})

    def on_answer_created(promise: Any, _unused: Any) -> None:
        promise.wait()
        reply = promise.get_reply()
        answer = reply.get_value("answer")
        if answer is None:
            write_answer(args.answer, {"ok": False, "error": "GStreamer did not create a WebRTC answer"})
            loop.quit()
            return
        set_local = Gst.Promise.new()
        webrtc.emit("set-local-description", answer, set_local)
        set_local.interrupt()
        local_answer.update({"type": "answer", "sdp": answer.sdp.as_text()})
        GLib.timeout_add(max(250, int(args.ice_wait_ms)), finish_answer)

    def on_bus_message(_bus: Any, message: Any) -> None:
        if message.type == Gst.MessageType.ERROR:
            error, debug = message.parse_error()
            if not answer_written["value"]:
                write_answer(
                    args.answer,
                    {
                        "ok": False,
                        "error": "GStreamer WebRTC pipeline failed",
                        "detail": str(error),
                        "debug": debug,
                    },
                )
            loop.quit()
        elif message.type == Gst.MessageType.EOS:
            loop.quit()

    webrtc.connect("on-ice-candidate", on_ice_candidate)
    bus = pipeline.get_bus()
    bus.add_signal_watch()
    bus.connect("message", on_bus_message)

    result, sdp_message = GstSdp.SDPMessage.new()
    if result != GstSdp.SDPResult.OK:
        write_answer(args.answer, {"ok": False, "error": "Could not allocate SDP message"})
        return 6
    parse_result = GstSdp.sdp_message_parse_buffer(offer["sdp"].encode("utf-8"), sdp_message)
    if parse_result != GstSdp.SDPResult.OK:
        write_answer(args.answer, {"ok": False, "error": "Could not parse WebRTC offer SDP"})
        return 7

    remote_offer = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.OFFER, sdp_message)
    pipeline.set_state(Gst.State.PLAYING)
    set_remote = Gst.Promise.new()
    webrtc.emit("set-remote-description", remote_offer, set_remote)
    set_remote.interrupt()
    answer_promise = Gst.Promise.new_with_change_func(on_answer_created, None)
    webrtc.emit("create-answer", None, answer_promise)

    def shutdown(_signum: int, _frame: Any) -> None:
        loop.quit()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    loop.run()
    pipeline.set_state(Gst.State.NULL)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
