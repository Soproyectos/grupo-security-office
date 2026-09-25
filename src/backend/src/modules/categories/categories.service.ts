import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type MenuCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  sortOrder: number;
  isActive?: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  sortOrder: number;
  children: MenuCategory[];
};

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, children: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      data: categories.map((c) => ({
        ...c,
        productCount: c._count.products,
        childrenCount: c._count.children,
      })),
    };
  }

  async findTree() {
    const categories = await this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { data: this.buildTree(categories) };
  }

  async findMenu() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        imageUrl: true,
        iconUrl: true,
        isFeatured: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { data: this.buildMenuTree(categories) };
  }

  /**
   * Ensambla el árbol de categorías de forma recursiva, soportando
   * profundidad arbitraria. El orden lo resuelve Prisma en la consulta
   * (orderBy); esta función solo conserva el orden y anida los hijos.
   */
  private buildTree(nodes: any[], parentId: string | null = null): any[] {
    return nodes
      .filter((n) => n.parentId === parentId)
      .map((n) => ({
        ...n,
        children: this.buildTree(nodes, n.id),
      }));
  }

  private buildMenuTree(
    nodes: MenuCategoryRecord[],
    parentId: string | null = null,
    depth = 1,
  ): MenuCategory[] {
    if (depth > 3) return [];

    return nodes
      .filter((node) => node.parentId === parentId && node.isActive !== false)
      .map((node) => ({
        id: node.id,
        name: node.name,
        slug: node.slug,
        imageUrl: node.imageUrl,
        iconUrl: node.iconUrl,
        isFeatured: node.isFeatured,
        sortOrder: node.sortOrder,
        children: depth < 3 ? this.buildMenuTree(nodes, node.id, depth + 1) : [],
      }));
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        _count: { select: { products: true } },
      },
    });

    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Ya existe una categoría con ese slug');

    await this.validateParent(null, dto.parentId);

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        slug: dto.slug,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      },
    });

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException('Ya existe una categoría con ese slug');
    }

    await this.validateParent(id, dto.parentId);

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      },
    });

    return updated;
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { products: true, children: true },
    });

    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (category.products.length > 0) {
      throw new ConflictException('No se puede eliminar una categoría con productos');
    }
    if (category.children.length > 0) {
      throw new ConflictException('No se puede eliminar una categoría con subcategorías');
    }

    await this.prisma.category.delete({ where: { id } });
    return { message: 'Categoría eliminada exitosamente' };
  }

  /**
   * Valida que un parentId sea asignable sin romper la jerarquía:
   *  1. parentId no puede ser la propia categoría (parentId === nodeId).
   *  2. El nuevo padre no puede ser descendiente del nodo (evita ciclos
   *     tipo A -> B -> A): se sube por la cadena de padres del nuevo padre
   *     y si en algún nivel aparece el nodo, es porque el padre es un
   *     descendiente de él.
   * Mantiene además la validación de existencia del padre.
   */
  private async validateParent(nodeId: string | null, parentId?: string): Promise<void> {
    if (!parentId) return;

    if (parentId === nodeId) {
      throw new BadRequestException('Una categoría no puede ser su propio padre');
    }

    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Categoría padre no encontrada');

    if (!nodeId) return;

    let current = parent.parentId;
    const visited = new Set<string>();
    while (current) {
      if (current === nodeId) {
        throw new BadRequestException(
          'La categoría padre no puede ser descendiente de esta categoría (evita ciclos en la jerarquía)',
        );
      }
      if (visited.has(current)) break;
      visited.add(current);
      const ancestor = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = ancestor?.parentId ?? null;
    }
  }
}
