import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('/')
export class RootController {
  @Get('/')
  getRoot(): string {
    return 'App is running!';
  }
}
