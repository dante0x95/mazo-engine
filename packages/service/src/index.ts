import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

logger.info({ port: env.PORT, env: env.NODE_ENV }, "aplicación iniciada");
logger.debug("este solo se ve con LOG_LEVEL=debug");
