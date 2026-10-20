import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ApprovePortalAccountDto {
  @IsOptional() @IsUUID() customerId?: string;
}

export class RejectPortalAccountDto {
  @IsString() @Length(3, 500) reason!: string;
}
