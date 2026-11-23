import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

// Cost 12 is ~250 ms per check: unnoticeable at sign-in, slow for anyone guessing against a stolen hash.
const COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password and
// response times don't reveal which emails have accounts.
const dummyHash = bcrypt.hashSync("not-a-real-password", COST);
export const burnTime = (password: string) => bcrypt.compare(password, dummyHash);

// Easy to read aloud or type from a message: no 0/O, 1/l/I. Always letters and digits, 14 characters,
// which passes the password rule.
const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export function temporaryPassword(): string {
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(LETTERS, 4)}-${pick(DIGITS, 4)}-${pick(LETTERS, 4)}`;
}
