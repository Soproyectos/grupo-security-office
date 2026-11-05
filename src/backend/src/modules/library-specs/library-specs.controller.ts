import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { RequireGrant } from '../../common/security/require-grant'
import { RequireGrantOrMastersWrite } from '../masters/masters-write'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  ApproveTemplateEntryDto,
  CreateSpecDefinitionDto,
  UpdateProductSpecValuesDto,
  UpdateSpecDefinitionDto,
  UpdateTemplateDto,
} from './dto/library-specs.dto'
import { badRequest } from './library-specs.rules'
import { ProductSpecValuesService } from './product-spec-values.service'
import { SpecDictionaryService } from './spec-dictionary.service'
import { SpecTemplateService } from './spec-template.service'

/**
 * Key data ("datos clave") of the library: dictionary, templates per
 * subcategory and per-product values. Authorized only by the panel grants that
 * the product sheet already uses: `products:read` to read, `products:write` to
 * change (dictionary, template and values). Publishing key specs also needs `products:publish`. Approving a template row needs the
 * explicit `products:approveSpecs` grant on top; the approver is always the
 * authenticated user, never a value sent in the body.
 */
@ApiTags('Library key specs')
@ApiBearerAuth()
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibrarySpecsController {
  constructor(
    private readonly dictionary: SpecDictionaryService,
    private readonly templates: SpecTemplateService,
    private readonly values: ProductSpecValuesService,
  ) {}

  private actor(user: any) {
    return { userId: (user?.sub ?? user?.id ?? null) as string | null }
  }

  // ------------------------------------------------------------- dictionary
  @Get('library/spec-definitions')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'List the dictionary of key data' })
  listDefinitions(@Query('includeInactive') includeInactive?: string, @Query('q') q?: string) {
    return this.dictionary.list({ includeInactive: includeInactive === 'true', q })
  }

  @Get('library/spec-definitions/:idOrKey/usage')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Usage of a key datum: molds that ask for it and stored product values' })
  definitionUsage(@Param('idOrKey') idOrKey: string) {
    return this.dictionary.usage(idOrKey)
  }

  @Get('library/subcategories/:subcategoryId/spec-template/usage')
  @RequireGrant('masters:read')
  @ApiOperation({ summary: 'Mold usage of a subcategory (entries by status, products using it)' })
  templateUsage(@Param('subcategoryId') subcategoryId: string) {
    return this.templates.usage(subcategoryId)
  }

  @Get('library/spec-definitions/:idOrKey')
  @RequireGrant('products:read')
  getDefinition(@Param('idOrKey') idOrKey: string) {
    return this.dictionary.get(idOrKey)
  }

  @Post('library/spec-definitions')
  @RequireGrantOrMastersWrite('products:write')
  createDefinition(@Body() dto: CreateSpecDefinitionDto) {
    return this.dictionary.create(dto)
  }

  @Patch('library/spec-definitions/:idOrKey')
  @RequireGrantOrMastersWrite('products:write')
  updateDefinition(@Param('idOrKey') idOrKey: string, @Body() dto: UpdateSpecDefinitionDto) {
    return this.dictionary.update(idOrKey, dto)
  }

  // --------------------------------------------------------------- template
  @Get('library/subcategories/:subcategoryId/spec-template')
  @RequireGrant('products:read')
  getTemplate(@Param('subcategoryId') subcategoryId: string) {
    return this.templates.get(subcategoryId)
  }

  @Put('library/subcategories/:subcategoryId/spec-template')
  @RequireGrantOrMastersWrite('products:write')
  @ApiOperation({ summary: 'Upsert template rows (all-or-nothing). Never approves, never deletes: use status RETIRED.' })
  putTemplate(@Param('subcategoryId') subcategoryId: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.upsertEntries(subcategoryId, dto.entries)
  }

  @Post('library/subcategories/:subcategoryId/spec-template/:specKey/approve')
  @RequireGrant('products:write', 'products:approveSpecs')
  @ApiOperation({ summary: 'Explicitly approve one template row. The approver is the authenticated user; justification for required rows.' })
  approve(
    @Param('subcategoryId') subcategoryId: string,
    @Param('specKey') specKey: string,
    @Body() dto: ApproveTemplateEntryDto,
    @CurrentUser() user: any,
  ) {
    return this.templates.approve(subcategoryId, specKey, this.actor(user).userId ?? '', dto)
  }

  // ----------------------------------------------------------------- values
  @Get('products/:id/key-specs')
  @RequireGrant('products:read')
  getValues(@Param('id') id: string) {
    return this.values.getValues(id)
  }

  @Put('products/:id/key-specs')
  @RequireGrant('products:write')
  @ApiOperation({ summary: 'Save key-data values of a product (WORKING stage). Per-entry result; partial saves allowed.' })
  async putValues(@Param('id') id: string, @Body() dto: UpdateProductSpecValuesDto, @CurrentUser() user: any) {
    const results = await this.values.writeProductSpecValues(id, dto.entries, {
      source: { kind: 'editor' },
      actor: this.actor(user),
    })
    return { productId: id, results }
  }

  @Post('products/:id/key-specs/publish')
  // Publishing changes what the PUBLIC sees (no revision step), so it needs the publish grant on top of write.
  @RequireGrant('products:write', 'products:publish')
  @ApiOperation({
    summary: 'Publish the key-data values of a product: the PUBLISHED set becomes a copy of the WORKING set. Does not publish the product.',
  })
  publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.values.publishProductSpecValues(id, this.actor(user))
  }

  @Get('products/:id/key-specs/missing')
  @RequireGrant('products:read')
  getMissing(@Param('id') id: string, @Query('stage') stage?: string) {
    if (stage !== undefined && stage !== 'WORKING' && stage !== 'PUBLISHED') {
      throw badRequest('invalid_stage', 'stage must be WORKING or PUBLISHED.')
    }
    return this.values.getMissing(id, (stage as 'WORKING' | 'PUBLISHED' | undefined) ?? 'WORKING')
  }

  @Get('products/:id/key-specs/subcategory-change-preview')
  @RequireGrant('products:read')
  preview(@Param('id') id: string, @Query('subcategoryId') subcategoryId?: string) {
    if (!subcategoryId) throw badRequest('subcategory_required', 'subcategoryId is required.')
    return this.values.previewSubcategoryChange(id, subcategoryId)
  }

  @Get('products/:id/key-specs/projection')
  @RequireGrant('products:read')
  @ApiOperation({ summary: 'Published and draft projections (sheet group + facets) of a product' })
  projection(@Param('id') id: string) {
    return this.values.getProjections(id)
  }
}

