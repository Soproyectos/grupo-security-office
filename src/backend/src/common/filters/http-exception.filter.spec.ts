import { ArgumentsHost, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/users', method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);
  return { statusCode: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('HttpExceptionFilter', () => {
  it('forwards string feedback hints from the exception body', () => {
    const { statusCode, body } = run(
      new BadRequestException({
        message: 'La contraseña no cumple la política de seguridad.',
        score: 1,
        feedback: ['Debe tener al menos 12 caracteres.'],
      }),
    );

    expect(statusCode).toBe(400);
    expect(body.message).toBe('La contraseña no cumple la política de seguridad.');
    expect(body.feedback).toEqual(['Debe tener al menos 12 caracteres.']);
    expect(body).not.toHaveProperty('score');
  });

  it('omits feedback when the exception has none or it is not a string list', () => {
    expect(run(new NotFoundException('Producto no encontrado')).body).not.toHaveProperty('feedback');
    expect(run(new BadRequestException({ message: 'x', feedback: [{ a: 1 }] })).body).not.toHaveProperty('feedback');
  });

  it('forwards a string code and structured details, and nothing else, from the exception body', () => {
    const { body } = run(new ConflictException({
      code: 'REJECTED_ROWS_UNACKNOWLEDGED', message: 'Confirma las filas rechazadas.',
      details: { count: 2, rows: [{ rowNumber: 3, sku: 'A', code: 'UNKNOWN_REFERENCE' }] }, secret: 'x',
    }));
    expect(body.code).toBe('REJECTED_ROWS_UNACKNOWLEDGED');
    expect(body.details).toEqual({ count: 2, rows: [{ rowNumber: 3, sku: 'A', code: 'UNKNOWN_REFERENCE' }] });
    expect(body).not.toHaveProperty('secret');
  });

  it('omits code and details when absent or of the wrong type', () => {
    expect(run(new NotFoundException('x')).body).not.toHaveProperty('code');
    const { body } = run(new BadRequestException({ message: 'x', code: 5, details: 'text' }));
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('details');
  });
});
