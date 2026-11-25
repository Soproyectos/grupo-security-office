import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Confirmation to delete one's own account: password (has one) or the account email (Google only). */
export class DeletePortalAccountDto {
  @IsOptional() @IsString() @MaxLength(128)
  password?: string;

  @IsOptional() @IsString() @MaxLength(254)
  confirmEmail?: string;
}
