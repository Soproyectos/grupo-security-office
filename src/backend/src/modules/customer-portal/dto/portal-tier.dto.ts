import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
export class PortalTierDto {
 @Transform(({value})=>typeof value==='string'?value.trim():value)
 @IsString() @Length(2,80) name: string;
 @IsOptional() @IsString() @MaxLength(500) description?: string;
 @IsOptional() @IsUUID() priceListId?: string | null;
 @IsOptional() @IsBoolean() isActive?: boolean;
}
export class AssignPortalTierDto {
 @IsOptional() @IsUUID() tierId?: string | null;
}
