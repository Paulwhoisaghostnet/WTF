"use strict";

const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PORT = 30775;
const LOOPBACK_ORIGIN = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}`;

function startupError(error, { origin, productName }) {
  if (error?.code !== "EADDRINUSE") {
    return error instanceof Error ? error : new Error(String(error || "Unknown local server error"));
  }
  const conflict = new Error(
    `${productName} could not start because its local address ${origin} is already in use. ` +
      `Close the other application or service using this address, then reopen ${productName}. ` +
      "Do not clear application data; your saved projects remain on this computer.",
  );
  conflict.code = "PASTA_DESKTOP_ORIGIN_IN_USE";
  conflict.cause = error;
  return conflict;
}

function listenOnLoopback(server, { host, port, origin, productName }) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(startupError(error, { origin, productName }));
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(origin);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen({ host, port, exclusive: true });
    } catch (error) {
      server.off("error", onError);
      server.off("listening", onListening);
      reject(startupError(error, { origin, productName }));
    }
  });
}

function listenOnStableOrigin(server, productName) {
  return listenOnLoopback(server, {
    host: LOOPBACK_HOST,
    port: LOOPBACK_PORT,
    origin: LOOPBACK_ORIGIN,
    productName,
  });
}

module.exports = {
  LOOPBACK_HOST,
  LOOPBACK_PORT,
  LOOPBACK_ORIGIN,
  listenOnLoopback,
  listenOnStableOrigin,
};
