import { Module } from "@nestjs/common";
import { RbacService } from "./rbac.service";
import { RbacController } from "./rbac.controller";

@Module({
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}
