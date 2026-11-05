import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { LibrarySpecsController } from './library-specs.controller'
import { ProductSpecValuesService } from './product-spec-values.service'
import { PublishedKeySpecsService } from './published-key-specs.service'
import { SpecDictionaryService } from './spec-dictionary.service'
import { SpecTemplateService } from './spec-template.service'

@Module({
  imports: [PrismaModule],
  controllers: [LibrarySpecsController],
  providers: [SpecDictionaryService, SpecTemplateService, ProductSpecValuesService, PublishedKeySpecsService],
  exports: [SpecDictionaryService, SpecTemplateService, ProductSpecValuesService, PublishedKeySpecsService],
})
export class LibrarySpecsModule {}
