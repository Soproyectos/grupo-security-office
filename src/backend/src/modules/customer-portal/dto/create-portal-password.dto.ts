import { IsString, MaxLength } from 'class-validator';

/**
 * First password for a Google-only account. Length (12-128) and strength are checked in the service so a short
 * password gets the Spanish WEAK_PASSWORD message instead of a generic validation error.
 */
export class CreatePortalPasswordDto {
  @IsString() @MaxLength(1024)
  newPassword!: string;
}
