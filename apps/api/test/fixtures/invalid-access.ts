import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import { Public, Roles } from '../../src/access.ts';
import { AppModule } from '../../src/app.module.ts';
import { bootstrap } from '../../src/bootstrap.ts';
import { loadEnv } from '../../src/env.ts';

// O processo real da API (o mesmo `bootstrap` do `main.ts`) com uma rota a mais, de acesso mal
// declarado. O argumento escolhe qual: `undeclared` ou `double`.

@Controller('api')
class UndeclaredController {
  @Get('undeclared')
  undeclared() {
    return {};
  }
}

@Controller('api')
class DoubleController {
  @Get('double')
  @Public()
  @Roles('admin')
  double() {
    return {};
  }
}

const env = loadEnv(process.env);
const module = AppModule.register(env);
const extra = process.argv[2] === 'double' ? DoubleController : UndeclaredController;
await bootstrap(env, { ...module, controllers: [...(module.controllers ?? []), extra] });
