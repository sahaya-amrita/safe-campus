import SwaggerParser from '@apidevtools/swagger-parser';
import { fileURLToPath } from 'node:url';

await SwaggerParser.validate(fileURLToPath(new URL('../docs/api/openapi.yaml', import.meta.url)));
process.stdout.write('OpenAPI document is valid.\n');
