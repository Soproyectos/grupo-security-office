import { ValidationPipe } from '@nestjs/common';
import { UpdateProductImageDto } from './update-product-image.dto';

describe('UpdateProductImageDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const metadata = { type: 'body' as const, metatype: UpdateProductImageDto };

  it.each(['PORTADA', 'LOGO', 'PRINCIPAL', 'COMPLEMENTARIA', 'EXTRA'])(
    'acepta el tipo de imagen %s con la validación HTTP real', async (type) => {
      const result = await pipe.transform({ type }, metadata);
      expect(result).toBeInstanceOf(UpdateProductImageDto);
      expect(result.type).toBe(type);
    },
  );

  it('rechaza un tipo inválido con 400 en vez de eliminarlo por whitelist', async () => {
    await expect(pipe.transform({ type: 'DESCONOCIDO' }, metadata)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rechaza null porque type es una columna enum no anulable', async () => {
    await expect(pipe.transform({ type: null }, metadata)).rejects.toMatchObject({
      status: 400,
    });
  });
});
