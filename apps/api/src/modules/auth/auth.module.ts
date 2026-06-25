import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OAuthService } from "./oauth.service";
import { GoogleOAuthController } from "./controllers/google.controller";
import { GithubOAuthController } from "./controllers/github.controller";
import { AppleOAuthController } from "./controllers/apple.controller";
import { SmtpModule } from "../smtp/smtp.module";

@Module({
  imports: [SmtpModule],
  controllers: [
    AuthController,
    GoogleOAuthController,
    GithubOAuthController,
    AppleOAuthController,
  ],
  providers: [AuthService, OAuthService],
  exports: [AuthService, OAuthService],
})
export class AuthModule {}
