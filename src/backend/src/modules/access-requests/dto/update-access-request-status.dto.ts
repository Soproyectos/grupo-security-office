import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AccessRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class UpdateAccessRequestStatusDto {
  @ApiProperty({
    enum: AccessRequestStatus,
    example: 'APPROVED',
  })
  @IsEnum(AccessRequestStatus)
  status: AccessRequestStatus;
}
