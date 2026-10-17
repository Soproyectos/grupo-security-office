import { Transform } from "class-transformer";
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class RequestAccountDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsIn(["INSTALLER", "DISTRIBUTOR", "COMPANY"]) profile: string;
  @Equals(true) consent: boolean;
}
export class CustomerLoginDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email: string;
  @IsString() @MinLength(1) @MaxLength(72) password: string;
  @IsOptional() @IsBoolean() remember?: boolean;
}
export class CustomerEmailDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email: string;
}
export class ConsumeCustomerTokenDto {
  @IsString() @MinLength(64) @MaxLength(64) token: string;
  @IsString() @MinLength(12) @MaxLength(72) password: string;
}
export class ReviewAccountDto {
  @IsIn(["APPROVED", "REJECTED", "SUSPENDED", "PENDING"]) status: string;
  @IsOptional() @IsUUID() priceListId?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
export class StorefrontQueryDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @IsString() @MaxLength(160) category?: string;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(10000)
  skip?: number;
}
export class StorefrontAdminQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(1000000)
  accountSkip?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(1000000)
  inquirySkip?: number;
}
export class InquiryDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
  @IsEmail() @MaxLength(254) email: string;
  @IsIn(["GENERAL", "ACCESS", "PRODUCT", "WARRANTY"]) topic: string;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  message: string;
  @IsOptional() @IsUUID() productId?: string;
  @Equals(true) consent: boolean;
}
export class StorefrontSettingsDto {
  @IsOptional() @IsUUID() publicPriceListId?: string;
  @IsBoolean() pricesIncludeTax: boolean;
  @IsString() @MaxLength(120) senderName: string;
  @IsOptional() @IsString() @MaxLength(254) senderEmail?: string;
  @IsOptional() @IsString() @MaxLength(254) supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) supportPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsapp?: string;
  @IsString() @MaxLength(180) hours: string;
  @IsString() @MaxLength(12000) about: string;
  @IsString() @MaxLength(30000) privacy: string;
  @IsString() @MaxLength(30000) terms: string;
  @IsString() @MaxLength(30000) warranty: string;
}
