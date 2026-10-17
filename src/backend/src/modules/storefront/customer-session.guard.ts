import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { StorefrontService } from "./storefront.service";

@Injectable()
export class CustomerSessionGuard implements CanActivate {
  constructor(private readonly service: StorefrontService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const account = await this.service.sessionAccount(
      request.cookies?.gs_customer_session,
    );
    if (!account)
      throw new UnauthorizedException(
        "Ingresa a tu cuenta de cliente para continuar.",
      );
    request.customerAccount = account;
    return true;
  }
}
