import { describe } from "vitest";

/** Guard de banco vivo (padrão autarkeia-method): sem DATABASE_URL, a suíte
 * pula de forma HONESTA — e o job db-tests do CI confere (via pr-gate.yml) que
 * todo arquivo com este guard está na lista que ele executa de verdade. */
export const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
