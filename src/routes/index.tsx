import { createFileRoute } from "@tanstack/react-router";
import { Rokulex } from "@/components/rokulex/Rokulex";

export const Route = createFileRoute("/")({ component: Rokulex });
