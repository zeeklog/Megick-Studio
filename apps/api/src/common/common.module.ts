import { Global, Module } from "@nestjs/common";
import { CryptoService } from "./services/crypto.service";
import { RedisService } from "./services/redis.service";
import { SessionService } from "./services/session.service";
import { ConfigSecretService } from "./services/config-secret.service";
import { AdvancedAccessService } from "./services/advanced-access.service";

@Global()
@Module({
  providers: [
    CryptoService,
    RedisService,
    SessionService,
    ConfigSecretService,
    AdvancedAccessService,
  ],
  exports: [
    CryptoService,
    RedisService,
    SessionService,
    ConfigSecretService,
    AdvancedAccessService,
  ],
})
export class CommonModule {}
