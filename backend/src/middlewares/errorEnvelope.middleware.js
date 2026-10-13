const crypto = require("node:crypto");
const logger = require("../utils/logger");
const { toPublicError } = require("../utils/apiError");

// An incoming X-Request-Id (e.g. from a load balancer) is reused only if it looks like an ID.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Gives every request an ID (echoed in the X-Request-Id header) and passes every error body
 * (status >= 400) through toPublicError, so all errors share one sanitized shape. The full
 * internal message, when withheld from the client, is logged with the request ID instead.
 */
function errorEnvelope(req, res, next) {
  const incoming = req.get("x-request-id");
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set("X-Request-Id", req.id);

  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) return json(body);
    const { body: publicBody, internalMessage } = toPublicError(res.statusCode, body, req.id);
    const fields = {
      requestId: req.id,
      method: req.method,
      route: req.baseUrl + (req.route?.path ?? ""),
      status: res.statusCode,
      code: publicBody.code,
    };
    if (res.statusCode >= 500) logger.error("http.error", { ...fields, error: internalMessage ?? publicBody.message });
    else if (internalMessage) logger.warn("http.client_error_withheld", { ...fields, error: internalMessage });
    return json(publicBody);
  };
  next();
}

module.exports = { errorEnvelope };
