import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
export class PortalTierDto {
 @Transform(({value})=>typeof value==='string'?value.trim():value)
 @IsString() @Length(2,80) name: string;
 @IsOptional() @IsString() @MaxLength(500) description?: string;
 @IsOptional() @IsUUID() priceListId?: string | null;
 @IsOptional() @IsBoolean() isActive?: boolean;
}
/**
 * Exactly one form: `priceListId` (the tariff picked in the panel; the tier behind it is found or created by the server),
 * `tierId` (kept for compatibility) or null in either of them for the general tariff. Sending both is rejected.
 */
export class AssignPortalTierDto {
 @IsOptional() @IsUUID() tierId?: string | null;
 @IsOptional() @IsUUID() priceListId?: string | null;
}
export class LinkPortalCustomerDto {
 @IsOptional() @IsUUID() customerId?: string | null;
}
export class AssignPortalAdvisorDto {
 @IsUUID('all',{message:'El asesor indicado no es válido'}) advisorId: string;
}
