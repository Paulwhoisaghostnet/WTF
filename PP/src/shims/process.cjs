const env = {
  NODE_ENV: "production",
};

module.exports = {
  browser: true,
  env,
  nextTick(callback, ...args) {
    Promise.resolve().then(() => callback(...args));
  },
};
