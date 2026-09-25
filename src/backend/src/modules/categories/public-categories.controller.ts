import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';

@ApiTags('Public Categories')
@Controller('api/public/categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('menu')
  findMenu() {
    return this.categoriesService.findMenu();
  }
}
