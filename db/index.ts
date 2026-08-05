import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as authSchema from './schema/auth';
import * as quizSchema from './schema/quiz';

export const db = drizzle(process.env.DATABASE_URL!, {
    schema: { ...authSchema, ...quizSchema },
});
