import { Module } from "@nestjs/common";
import {
  StorefrontController,
  CustomerAccessController,
  StorefrontAdminController,
} from "./storefront.controller";
import { StorefrontService } from "./storefront.service";
import { StorefrontMailService } from "./storefront-mail.service";
import { CustomerSessionGuard } from "./customer-session.guard";

@Module({
  controllers: [
    StorefrontController,
    CustomerAccessController,
    StorefrontAdminController,
  ],
  providers: [StorefrontService, StorefrontMailService, CustomerSessionGuard],
  exports: [StorefrontService],
})
export class StorefrontModule {}
