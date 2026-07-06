import importlib.util
import unittest
from pathlib import Path


STREAMER_PATH = Path(__file__).resolve().parents[1] / "bin" / "webrtc-streamer.py"
SPEC = importlib.util.spec_from_file_location("webrtc_streamer", STREAMER_PATH)
assert SPEC and SPEC.loader
webrtc_streamer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(webrtc_streamer)


class WebRtcStreamerTests(unittest.TestCase):
    def test_audio_caps_keep_opus_channel_count_as_string(self):
        source = STREAMER_PATH.read_text(encoding="utf-8")

        self.assertIn("encoding-params=(string)2", source)
        self.assertNotIn("encoding-params=2 ", source)

    def test_offered_payload_type_uses_audio_opus_from_browser_offer(self):
        sdp = "\r\n".join(
            [
                "v=0",
                "m=video 9 UDP/TLS/RTP/SAVPF 96 97",
                "a=rtpmap:96 VP8/90000",
                "a=rtpmap:97 rtx/90000",
                "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9",
                "a=rtpmap:111 opus/48000/2",
                "a=rtpmap:63 red/48000/2",
                "a=rtpmap:9 G722/8000",
            ]
        )

        self.assertEqual(webrtc_streamer.offered_payload_type(sdp, "audio", "opus", 97), 111)

    def test_offered_payload_type_falls_back_when_codec_is_missing(self):
        self.assertEqual(
            webrtc_streamer.offered_payload_type("m=audio 9 UDP/TLS/RTP/SAVPF 9\r\na=rtpmap:9 G722/8000", "audio", "opus", 111),
            111,
        )


if __name__ == "__main__":
    unittest.main()
