import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ExistingProduct,
  MediaDb,
  MediaFs,
  MediaTx,
  ProductMediaSource,
  applyProductPlan,
  buildProductLookup,
  buildProductMediaPlan,
  buildReport,
  loadEnrichment,
  mergeDocuments,
  normalizeSku,
  toSafeSku,
} from './import-product-media.logic';

const makeProduct = (overrides: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id: 'p1',
  sku: 'DS-2CE16U1T-ITF(2.8mm)',
  name: 'Bala TurboHD 4K',
  documents: null,
  images: [],
  ...overrides,
});

const makeSource = (imageCount: number, docNames: string[] = []): ProductMediaSource => ({
  sku: 'DS-2CE16U1T-ITF(2.8MM)',
  images: Array.from({ length: imageCount }, (_, i) => ({
    absPath: `/src/img_${i + 1}.png`,
    fileName: `hikvision__X__0${i + 1}.png`,
    size: 1000 + i,
  })),
  docs: docNames.map((fileName) => ({ absPath: `/src/${fileName}`, fileName, size: 5000 })),
});

describe('import-product-media.logic', () => {
  describe('normalizeSku / toSafeSku', () => {
    it('is case and whitespace insensitive', () => {
      expect(normalizeSku(' ds-2ce16u1t-itf (2.8mm) ')).toBe(normalizeSku('DS-2CE16U1T-ITF(2.8MM)'));
    });

    it('returns an empty key for null-ish input', () => {
      expect(normalizeSku(null)).toBe('');
      expect(normalizeSku(undefined)).toBe('');
    });

    it('mirrors the enrichment tool directory naming', () => {
      expect(toSafeSku('DS-2CE19U1T-AIT3ZF(2.7-13.5MM)')).toBe('DS_2CE19U1T_AIT3ZF_2_7_13_5MM');
      expect(toSafeSku('iDS-7216HQHI-M1/XT')).toBe('IDS_7216HQHI_M1_XT');
    });
  });

  describe('buildProductLookup', () => {
    it('matches DB (2.8mm) with tool (2.8MM) and drops ambiguous SKUs', () => {
      const lookup = buildProductLookup([
        makeProduct({ id: 'a', sku: 'DS-2CE16U1T-ITF(2.8mm)' }),
        makeProduct({ id: 'b', sku: 'X-1' }),
        makeProduct({ id: 'c', sku: 'x-1' }),
      ]);
      expect(lookup.bySku.get(normalizeSku('DS-2CE16U1T-ITF(2.8MM)'))?.id).toBe('a');
      expect(lookup.ambiguous.has('X-1')).toBe(true);
      expect(lookup.bySku.has('X-1')).toBe(false);
    });
  });

  describe('buildProductMediaPlan', () => {
    it('numbers images in source order and makes the first one primary', () => {
      const plan = buildProductMediaPlan(makeProduct(), makeSource(3));
      expect(plan.imagesToCreate.map((i) => i.url)).toEqual([
        '/uploads/products/p1/01.png',
        '/uploads/products/p1/02.png',
        '/uploads/products/p1/03.png',
      ]);
      expect(plan.imagesToCreate.map((i) => i.isPrimary)).toEqual([true, false, false]);
      expect(plan.imagesToCreate.map((i) => i.type)).toEqual([
        'PRINCIPAL',
        'COMPLEMENTARIA',
        'COMPLEMENTARIA',
      ]);
      expect(plan.imagesToCreate.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
      expect(plan.imagesToCreate.every((i) => i.alt === 'Bala TurboHD 4K')).toBe(true);
      expect(plan.officialImagesAfter).toBe(3);
    });

    it('does not create a primary when the product already has one and sorts after existing rows', () => {
      const product = makeProduct({
        images: [{ url: 'https://retailer.example/a.jpg', isPrimary: true, sortOrder: 4 }],
      });
      const plan = buildProductMediaPlan(product, makeSource(2));
      expect(plan.imagesToCreate.some((i) => i.isPrimary)).toBe(false);
      expect(plan.imagesToCreate.map((i) => i.sortOrder)).toEqual([5, 6]);
      expect(plan.officialImagesAfter).toBe(2);
    });

    it('makes the first new image primary when existing rows have no primary', () => {
      const product = makeProduct({
        images: [{ url: 'https://retailer.example/a.jpg', isPrimary: false, sortOrder: 0 }],
      });
      const plan = buildProductMediaPlan(product, makeSource(2));
      expect(plan.imagesToCreate.map((i) => i.isPrimary)).toEqual([true, false]);
    });

    it('is idempotent: a second plan over the imported state creates nothing', () => {
      const first = buildProductMediaPlan(makeProduct(), makeSource(3, ['hikvision__X__datasheet.pdf']));
      const imported = makeProduct({
        images: first.imagesToCreate.map((i) => ({
          url: i.url,
          isPrimary: i.isPrimary,
          sortOrder: i.sortOrder,
        })),
        documents: first.docsToAdd.map((d) => d.entry),
      });
      const second = buildProductMediaPlan(imported, makeSource(3, ['hikvision__X__datasheet.pdf']));
      expect(second.imagesToCreate).toHaveLength(0);
      expect(second.docsToAdd).toHaveLength(0);
      expect(second.imagesAlreadyPresent).toBe(3);
      expect(second.docsAlreadyPresent).toBe(1);
      expect(second.officialImagesAfter).toBe(3);
    });

    it('only plans the missing images after a partial previous run', () => {
      const product = makeProduct({
        images: [{ url: '/uploads/products/p1/01.png', isPrimary: true, sortOrder: 0 }],
      });
      const plan = buildProductMediaPlan(product, makeSource(3));
      expect(plan.imagesToCreate.map((i) => i.url)).toEqual([
        '/uploads/products/p1/02.png',
        '/uploads/products/p1/03.png',
      ]);
      expect(plan.imagesToCreate.some((i) => i.isPrimary)).toBe(false);
      expect(plan.officialImagesAfter).toBe(3);
    });

    it('normalizes .jpeg to .jpg', () => {
      const source = makeSource(1);
      source.images[0].fileName = 'photo.JPEG';
      const plan = buildProductMediaPlan(makeProduct(), source);
      expect(plan.imagesToCreate[0].destRelPath).toBe('products/p1/01.jpg');
    });

    it('adds documents with labels and skips ones already listed by url', () => {
      const existing = [{ name: 'Ficha', url: '/uploads/products/p1/docs/hikvision__X__datasheet.pdf' }];
      const plan = buildProductMediaPlan(
        makeProduct({ documents: existing }),
        makeSource(0, ['hikvision__X__datasheet.pdf', 'hikvision__X__manual.pdf']),
      );
      expect(plan.docsToAdd).toHaveLength(1);
      expect(plan.docsToAdd[0].entry).toEqual({
        name: 'Manual de usuario',
        url: '/uploads/products/p1/docs/hikvision__X__manual.pdf',
        type: 'manual',
        size: 5000,
      });
      expect(plan.docsAlreadyPresent).toBe(1);
    });

    it('leaves documents untouched when the stored value is not an array', () => {
      const plan = buildProductMediaPlan(
        makeProduct({ documents: { unexpected: true } }),
        makeSource(0, ['hikvision__X__datasheet.pdf']),
      );
      expect(plan.documentsSkippedBadShape).toBe(true);
      expect(plan.docsToAdd).toHaveLength(0);
    });
  });

  describe('mergeDocuments', () => {
    it('keeps existing entries first and unmodified', () => {
      const existing = [{ name: 'Old', url: '/x.pdf', type: 'datasheet', size: 1 }];
      const added = [{ name: 'New', url: '/y.pdf', type: 'manual', size: 2 }];
      expect(mergeDocuments(existing, added)).toEqual([...existing, ...added]);
      expect(mergeDocuments(null, added)).toEqual(added);
    });
  });

  describe('buildReport', () => {
    it('buckets products by official image count and excludes failed products from totals', () => {
      const plan = (sku: string, n: number, existingOfficial = 0) => ({
        ...buildProductMediaPlan(
          makeProduct({
            id: sku,
            sku,
            images: Array.from({ length: existingOfficial }, (_, i) => ({
              url: `/uploads/products/${sku}/e${i}.png`,
              isPrimary: false,
              sortOrder: i,
            })),
          }),
          { ...makeSource(n), sku },
        ),
      });
      const report = buildReport({
        enrichedMatched: 6,
        plans: [plan('A', 3), plan('B', 2), plan('C', 0), plan('D', 1)],
        unmatchedSkus: ['Z'],
        ambiguousSkus: [],
        failedSkus: ['D'],
      });
      expect(report.productsWith3OrMore).toBe(1);
      expect(report.productsWith1To2).toBe(1);
      expect(report.productsWith0).toBe(2); // C and the failed D
      expect(report.imagesCreated).toBe(5);
      expect(report.unmatchedSkus).toEqual(['Z']);
    });
  });

  describe('loadEnrichment', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-import-'));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const writeFile = (rel: string, content = 'x'.repeat(20)) => {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };

    it('reads only matched entries, sorts images naturally and docs by kind', () => {
      fs.writeFileSync(
        path.join(dir, 'catalogo_hikvision_especificaciones.json'),
        JSON.stringify([
          { sku_input: 'DS-2CE16U1T-ITF(2.8MM)', match_status: 'matched' },
          { sku_input: 'NOPE-1', match_status: 'not_found' },
          { sku_input: 'DS-2CE16U1T-ITF(2.8MM)', match_status: 'matched' },
        ]),
      );
      const safe = 'DS_2CE16U1T_ITF_2_8MM';
      writeFile(`${safe}/images/hikvision__${safe}__10.png`);
      writeFile(`${safe}/images/hikvision__${safe}__02.png`);
      writeFile(`${safe}/images/empty.png`, '');
      writeFile(`${safe}/images/notes.txt`);
      writeFile(`${safe}/pdfs/hikvision__${safe}__manual.pdf`);
      writeFile(`${safe}/pdfs/hikvision__${safe}__datasheet.pdf`);

      const result = loadEnrichment(dir);
      expect(result.skippedNotMatched).toBe(1);
      expect(result.duplicates).toEqual(['DS-2CE16U1T-ITF(2.8MM)']);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].images.map((f) => f.fileName)).toEqual([
        `hikvision__${safe}__02.png`,
        `hikvision__${safe}__10.png`,
      ]);
      expect(result.sources[0].docs.map((f) => f.fileName)).toEqual([
        `hikvision__${safe}__datasheet.pdf`,
        `hikvision__${safe}__manual.pdf`,
      ]);
    });

    it('fails clearly when the JSON is missing', () => {
      expect(() => loadEnrichment(dir)).toThrow(/catalogo_hikvision_especificaciones\.json/);
    });
  });

  describe('applyProductPlan', () => {
    const makeDb = () => {
      const tx: MediaTx = {
        productImage: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        product: { update: jest.fn().mockResolvedValue({}) },
      };
      const db: MediaDb = { $transaction: jest.fn(async (fn) => fn(tx)) };
      return { db, tx };
    };
    const makeFs = (): MediaFs => ({ mkdir: jest.fn(), copyFile: jest.fn() });

    it('copies files then writes images and documents in one transaction', async () => {
      const { db, tx } = makeDb();
      const mediaFs = makeFs();
      const plan = buildProductMediaPlan(
        makeProduct({ documents: [{ name: 'Old', url: '/old.pdf', type: 'datasheet', size: 1 }] }),
        makeSource(2, ['hikvision__X__datasheet.pdf']),
      );

      await applyProductPlan(db, plan, [{ name: 'Old', url: '/old.pdf', type: 'datasheet', size: 1 }], '/up', mediaFs);

      expect(mediaFs.copyFile).toHaveBeenCalledTimes(3);
      expect(mediaFs.copyFile).toHaveBeenCalledWith('/src/img_1.png', path.join('/up', 'products/p1/01.png'));
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      const createArgs = (tx.productImage.createMany as jest.Mock).mock.calls[0][0];
      expect(createArgs.data).toHaveLength(2);
      expect(createArgs.data[0]).toMatchObject({ productId: 'p1', isPrimary: true, sortOrder: 0 });
      const updateArgs = (tx.product.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.documents).toHaveLength(2);
      expect(updateArgs.data.documents[0].url).toBe('/old.pdf');
    });

    it('does nothing (no files, no transaction) for an empty plan', async () => {
      const { db } = makeDb();
      const mediaFs = makeFs();
      const first = buildProductMediaPlan(makeProduct(), makeSource(1));
      const imported = makeProduct({
        images: first.imagesToCreate.map((i) => ({ url: i.url, isPrimary: true, sortOrder: 0 })),
      });
      const empty = buildProductMediaPlan(imported, makeSource(1));

      await applyProductPlan(db, empty, null, '/up', mediaFs);

      expect(mediaFs.copyFile).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('never deletes: the transaction surface has no delete operation', async () => {
      const { db, tx } = makeDb();
      const plan = buildProductMediaPlan(makeProduct(), makeSource(1));
      await applyProductPlan(db, plan, null, '/up', makeFs());
      expect(Object.keys(tx.productImage)).toEqual(['createMany']);
      expect(Object.keys(tx.product)).toEqual(['update']);
    });
  });
});
