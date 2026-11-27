import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { GeoService } from './geo.service';

@ApiTags('Geo')
@Controller('api/public/municipalities')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /** Fixed list of Colombian municipalities (DIVIPOLA) for the city selector. Static data: cacheable for a day. */
  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=86400')
  list() { return this.geo.list(); }
}
