const clientIpMiddleware = (req, res, next) => {
  const forwarded = req.headers["x-forwarded-for"];
  req.clientIpAddress = forwarded
    ? forwarded.split(",")[0].trim()
    : req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip;
  next();
};

export default clientIpMiddleware;
