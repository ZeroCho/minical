export function assertSafeEnvironment() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("NODE_TLS_REJECT_UNAUTHORIZED=0 is not allowed");
  }
}
