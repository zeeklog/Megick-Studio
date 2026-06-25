import { Module } from "@nestjs/common";
import { OAuthProvidersController } from "./oauth-providers.controller";
import { OAuthProvidersService } from "./oauth-providers.service";

@Module({
  controllers: [OAuthProvidersController],
  providers: [OAuthProvidersService],
  exports: [OAuthProvidersService],
})
export class OAuthProvidersModule {}
