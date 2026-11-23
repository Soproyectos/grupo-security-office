import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CatalogRead } from '../../common/security/throttle-policy';

@ApiTags('Public Categories')
@Controller('api/public/categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @CatalogRead()
  @Get('menu')
  findMenu() {
    return this.categoriesService.findMenu();
  }
}
