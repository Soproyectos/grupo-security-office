import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { CustomerAccount } from "@prisma/client";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { StorefrontService } from "./storefront.service";
import { CustomerSessionGuard } from "./customer-session.guard";
import {
  ConsumeCustomerTokenDto,
  CustomerEmailDto,
  CustomerLoginDto,
  InquiryDto,
  RequestAccountDto,
  ReviewAccountDto,
  StorefrontQueryDto,
  StorefrontSettingsDto,
  StorefrontAdminQueryDto,
} from "./storefront.dto";

type CustomerRequest = Request & { customerAccount: CustomerAccount };
const cookieName = "gs_customer_session";

@ApiTags("Storefront")
@Public()
@Controller("api/storefront")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}
  @Get("settings") settings() {
    return this.storefront.publicSettings();
  }
  @Get("products")
  products(
    @Query() query: StorefrontQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "private, no-store");
    response.vary("Cookie");
    return this.storefront.catalog(query, request.cookies?.[cookieName]);
  }
  @Get("products/:id")
  product(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "private, no-store");
    response.vary("Cookie");
    return this.storefront.catalog({}, request.cookies?.[cookieName], id);
  }
  @Post("inquiries")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  inquire(@Body() dto: InquiryDto, @Headers("origin") origin?: string) {
    this.storefront.assertOrigin(origin);
    return this.storefront.inquire(dto);
  }
}

@ApiTags("Customer access")
@Public()
@Controller("api/customer-access")
export class CustomerAccessController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly config: ConfigService,
  ) {}
  @Post("request")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  request(@Body() dto: RequestAccountDto, @Headers("origin") origin?: string) {
    this.storefront.assertOrigin(origin);
    return this.storefront.requestAccount(dto);
  }
  @Post("forgot")
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  forgot(@Body() dto: CustomerEmailDto, @Headers("origin") origin?: string) {
    this.storefront.assertOrigin(origin);
    return this.storefront.requestReset(dto.email);
  }
  @Post("verify")
  @HttpCode(200)
  verify(
    @Body() dto: ConsumeCustomerTokenDto,
    @Headers("origin") origin?: string,
  ) {
    this.storefront.assertOrigin(origin);
    return this.storefront.consumeToken(dto, "VERIFY");
  }
  @Post("reset")
  @HttpCode(200)
  reset(
    @Body() dto: ConsumeCustomerTokenDto,
    @Headers("origin") origin?: string,
  ) {
    this.storefront.assertOrigin(origin);
    return this.storefront.consumeToken(dto, "RESET");
  }
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: CustomerLoginDto,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.storefront.assertOrigin(origin);
    const result = await this.storefront.login(dto);
    response.cookie(cookieName, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
      path: "/",
      ...(dto.remember ? { expires: result.expiresAt } : {}),
    });
    response.setHeader("Cache-Control", "no-store");
    return result.account;
  }
  @Get("me")
  @UseGuards(CustomerSessionGuard)
  me(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.storefront.account(request.customerAccount.id);
  }
  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.storefront.assertOrigin(origin);
    await this.storefront.logout(request.cookies?.[cookieName]);
    response.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
      path: "/",
    });
    return { message: "Sesión cerrada." };
  }
}

@ApiTags("Commercial - Storefront")
@Controller("api/commercial/storefront")
@UseGuards(RolesGuard)
@Roles("Super Admin", "Admin Comercial")
export class StorefrontAdminController {
  constructor(private readonly storefront: StorefrontService) {}
  @Get() overview(@Query() query: StorefrontAdminQueryDto) {
    return this.storefront.adminOverview(query);
  }
  @Patch("settings") settings(
    @Body() dto: StorefrontSettingsDto,
    @CurrentUser() user: { sub?: string; id: string },
  ) {
    return this.storefront.saveSettings(dto, user.sub ?? user.id);
  }
  @Patch("accounts/:id") review(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewAccountDto,
    @CurrentUser() user: { sub?: string; id: string },
  ) {
    return this.storefront.review(id, dto, user.sub ?? user.id);
  }
  @Patch("inquiries/:id/resolve") resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub?: string; id: string },
  ) {
    return this.storefront.resolveInquiry(id, user.sub ?? user.id);
  }
}
