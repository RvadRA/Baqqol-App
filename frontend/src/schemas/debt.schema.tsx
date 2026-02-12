// schemas/debt.schema.ts
import { z } from "zod";

export const debtCreateSchema = z.object({
  phone: z.string().min(6, "Некорректный номер"),
  name: z.string().min(1, "Имя обязательно"),
  amount: z.number().positive("Сумма должна быть больше 0"),
  item: z.string().optional(),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});

export const debtPaySchema = z.object({
  amount: z.number().positive("Сумма платежа должна быть > 0"),
});
