import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

// Served at /docs (https://<your-instance>/api/docs behind nginx)
export const loadSwagger = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('pocket3d API')
    .setDescription(
      'Publish a 3D model (.glb) and get a link anyone can open. Authenticate with your API key in the Authorization header.'
    )
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
};
