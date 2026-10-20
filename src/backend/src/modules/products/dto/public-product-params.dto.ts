import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PublicProductParamsDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id del producto' })
  @IsUUID()
  id: string;
}
