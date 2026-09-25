import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockCategory = {
  id: 'cat-1',
  name: 'CCTV',
  slug: 'cctv',
  description: 'Cámaras de vigilancia',
  parentId: null,
  sortOrder: 0,
  isActive: true,
  imageUrl: null,
  iconUrl: null,
  isFeatured: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCategoryWithRelations = {
  ...mockCategory,
  parent: null,
  _count: { products: 5, children: 2 },
};

const mockChildCategory = {
  ...mockCategory,
  id: 'cat-2',
  name: 'Cámaras IP',
  slug: 'camaras-ip',
  parentId: 'cat-1',
  parent: { id: 'cat-1', name: 'CCTV' },
  _count: { products: 3, children: 0 },
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('findAll', () => {
    it('debe listar categorías con padre e hijo y conteos', async () => {
      mockPrisma.category.findMany.mockResolvedValue([mockCategoryWithRelations, mockChildCategory]);

      const result = await service.findAll();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].productCount).toBe(5);
      expect(result.data[0].childrenCount).toBe(2);
    });
  });

  describe('findOne', () => {
    it('debe retornar categoría por id', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(mockCategoryWithRelations);

      const result = await service.findOne('cat-1');

      expect(result.id).toBe('cat-1');
      expect(result.name).toBe('CCTV');
    });

    it('debe lanzar NotFoundException cuando la categoría no existe', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debe crear una categoría', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.create.mockResolvedValue(mockCategory);

      const dto = {
        name: 'CCTV',
        slug: 'cctv',
        description: 'Cámaras de vigilancia',
        imageUrl: '/images/categories/cctv.svg',
        iconUrl: 'https://cdn.example.com/cctv.png',
        isFeatured: true,
      };
      const result = await service.create(dto);

      expect(result.name).toBe('CCTV');
      expect(result.slug).toBe('cctv');
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          imageUrl: dto.imageUrl,
          iconUrl: dto.iconUrl,
          isFeatured: dto.isFeatured,
        }),
      });
    });

    it('debe rechazar slug duplicado con ConflictException', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(mockCategory);

      const dto = { name: 'CCTV', slug: 'cctv' };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('Ya existe una categoría con ese slug');
    });

    it('debe validar parentId existente', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValueOnce(mockCategory);
      mockPrisma.category.create.mockResolvedValue(mockChildCategory);

      const dto = { name: 'Cámaras IP', slug: 'camaras-ip', parentId: 'cat-1' };
      const result = await service.create(dto);

      expect(result.parentId).toBe('cat-1');
    });

    it('debe lanzar NotFoundException si parentId no existe', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValueOnce(null);

      const dto = { name: 'Subcat', slug: 'subcat', parentId: 'no-existe' };

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toThrow('Categoría padre no encontrada');
    });
  });

  describe('update', () => {
    it('debe actualizar una categoría', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(mockCategory);
      mockPrisma.category.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.update.mockResolvedValue({ ...mockCategory, name: 'CCTV Profesional' });

      const dto = {
        name: 'CCTV Profesional',
        imageUrl: '/images/categories/cctv.webp',
        isFeatured: false,
      };
      const result = await service.update('cat-1', dto);

      expect(result.name).toBe('CCTV Profesional');
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: expect.objectContaining({
          imageUrl: dto.imageUrl,
          isFeatured: dto.isFeatured,
        }),
      });
    });

    it('debe lanzar NotFoundException si la categoría no existe', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', { name: 'Nope' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('findTree', () => {
    it('debe construir un árbol de profundidad arbitraria', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, id: 'cat-a', name: 'A', slug: 'a', parentId: null },
        { ...mockCategory, id: 'cat-b', name: 'B', slug: 'b', parentId: 'cat-a' },
        { ...mockCategory, id: 'cat-c', name: 'C', slug: 'c', parentId: 'cat-b' },
        { ...mockCategory, id: 'cat-d', name: 'D', slug: 'd', parentId: 'cat-c' },
      ]);

      const result = await service.findTree();

      expect(result.data).toHaveLength(1);
      const a = result.data[0];
      expect(a.id).toBe('cat-a');
      expect(a.children[0].id).toBe('cat-b');
      expect(a.children[0].children[0].id).toBe('cat-c');
      expect(a.children[0].children[0].children[0].id).toBe('cat-d');
      expect(a.children[0].children[0].children[0].children).toEqual([]);
    });

    it('debe conservar el orden sortOrder/name provisto por Prisma', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, id: 'cat-3', name: 'A', slug: 'a', parentId: null, sortOrder: 1 },
        { ...mockCategory, id: 'cat-4', name: 'Z', slug: 'z', parentId: null, sortOrder: 1 },
        { ...mockCategory, id: 'cat-2', name: 'B', slug: 'b', parentId: null, sortOrder: 2 },
      ]);

      const result = await service.findTree();

      expect(result.data.map((c) => c.id)).toEqual(['cat-3', 'cat-4', 'cat-2']);
    });
  });

  describe('findMenu', () => {
    it('excluye categorías inactivas y sus subárboles', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, id: 'active-root', name: 'Activa', slug: 'activa', parentId: null, isActive: true },
        { ...mockCategory, id: 'inactive-root', name: 'Inactiva', slug: 'inactiva', parentId: null, isActive: false },
        { ...mockCategory, id: 'active-child', name: 'Hija activa', slug: 'hija-activa', parentId: 'active-root', isActive: true },
        { ...mockCategory, id: 'hidden-child', name: 'Hija oculta', slug: 'hija-oculta', parentId: 'inactive-root', isActive: true },
      ]);

      const result = await service.findMenu();

      expect(result.data.map((category) => category.id)).toEqual(['active-root']);
      expect(result.data[0].children.map((category) => category.id)).toEqual(['active-child']);
    });

    it('limita el menú a tres niveles', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, id: 'level-1', slug: 'level-1', parentId: null },
        { ...mockCategory, id: 'level-2', slug: 'level-2', parentId: 'level-1' },
        { ...mockCategory, id: 'level-3', slug: 'level-3', parentId: 'level-2' },
        { ...mockCategory, id: 'level-4', slug: 'level-4', parentId: 'level-3' },
      ]);

      const result = await service.findMenu();

      expect(result.data[0].children[0].children[0].id).toBe('level-3');
      expect(result.data[0].children[0].children[0].children).toEqual([]);
    });

    it('expone únicamente el whitelist del menú en cada nivel', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        {
          ...mockCategory,
          id: 'root',
          slug: 'root',
          parentId: null,
          description: 'No debe aparecer',
          _count: { products: 4 },
        },
        {
          ...mockCategory,
          id: 'child',
          slug: 'child',
          parentId: 'root',
          description: 'No debe aparecer',
          _count: { products: 2 },
        },
      ]);

      const result = await service.findMenu();
      const expectedKeys = ['children', 'iconUrl', 'id', 'imageUrl', 'isFeatured', 'name', 'slug', 'sortOrder'];

      expect(Object.keys(result.data[0]).sort()).toEqual(expectedKeys);
      expect(Object.keys(result.data[0].children[0]).sort()).toEqual(expectedKeys);
      expect(result.data[0]).not.toHaveProperty('description');
      expect(result.data[0]).not.toHaveProperty('createdAt');
      expect(result.data[0]).not.toHaveProperty('updatedAt');
      expect(result.data[0]).not.toHaveProperty('_count');
    });

    it('conserva el orden de sortOrder y name de la consulta', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, id: 'root-zero', name: 'Cero', slug: 'cero', parentId: null, sortOrder: 0 },
        { ...mockCategory, id: 'root-a', name: 'A', slug: 'a', parentId: null, sortOrder: 1 },
        { ...mockCategory, id: 'root-b', name: 'B', slug: 'b', parentId: null, sortOrder: 1 },
      ]);

      const result = await service.findMenu();
      const query = mockPrisma.category.findMany.mock.calls[0][0];

      expect(result.data.map((category) => category.id)).toEqual(['root-zero', 'root-a', 'root-b']);
      expect(query.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
      expect(query.select).not.toHaveProperty('description');
      expect(query.select).not.toHaveProperty('createdAt');
      expect(query.select).not.toHaveProperty('updatedAt');
      expect(query.select).not.toHaveProperty('_count');
    });
  });

  describe('validación anti-ciclos en update', () => {
    it('debe rechazar parentId igual al id (auto-padre)', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(mockCategory);

      const err = await service.update('cat-1', { parentId: 'cat-1' }).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('propio padre');
    });

    it('debe rechazar un padre que sea descendiente del nodo', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(mockCategory);
      mockPrisma.category.findUnique.mockResolvedValueOnce({
        ...mockChildCategory,
        parentId: 'cat-1',
      });

      const err = await service.update('cat-1', { parentId: 'cat-2' }).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('descendiente');
    });

    it('debe detectar ciclos en profundidad (A -> B -> C -> A)', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(mockCategory);
      mockPrisma.category.findUnique.mockResolvedValueOnce({
        ...mockChildCategory,
        parentId: 'cat-3',
      });
      mockPrisma.category.findUnique.mockResolvedValueOnce({ ...mockCategory, id: 'cat-3', parentId: 'cat-1' });

      const err = await service.update('cat-1', { parentId: 'cat-2' }).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('descendiente');
    });

    it('debe permitir reasignar el padre si no hay ciclo', async () => {
      mockPrisma.category.findUnique.mockResolvedValueOnce(mockCategory);
      mockPrisma.category.findUnique.mockResolvedValueOnce({
        ...mockCategory,
        id: 'cat-9',
        name: 'Raíz',
        slug: 'raiz',
        parentId: null,
      });
      mockPrisma.category.update.mockResolvedValue({ ...mockCategory, parentId: 'cat-9' });

      const result = await service.update('cat-1', { parentId: 'cat-9' });

      expect(result.parentId).toBe('cat-9');
      expect(mockPrisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parentId: 'cat-9' }) }),
      );
    });
  });

  describe('remove', () => {
    it('debe eliminar una categoría sin productos ni subcategorías', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        products: [],
        children: [],
      });
      mockPrisma.category.delete.mockResolvedValue(mockCategory);

      const result = await service.remove('cat-1');

      expect(result.message).toBe('Categoría eliminada exitosamente');
    });

    it('debe lanzar ConflictException si la categoría tiene productos', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        products: [{ id: 'p1' }],
        children: [],
      });

      await expect(service.remove('cat-1')).rejects.toThrow(ConflictException);
      await expect(service.remove('cat-1')).rejects.toThrow('No se puede eliminar una categoría con productos');
    });

    it('debe lanzar ConflictException si la categoría tiene subcategorías', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        products: [],
        children: [{ id: 'child-1' }],
      });

      await expect(service.remove('cat-1')).rejects.toThrow(ConflictException);
      await expect(service.remove('cat-1')).rejects.toThrow('No se puede eliminar una categoría con subcategorías');
    });

    it('debe lanzar NotFoundException si la categoría no existe', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toThrow(NotFoundException);
    });
  });
});
