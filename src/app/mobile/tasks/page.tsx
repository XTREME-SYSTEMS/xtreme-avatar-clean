import type { Metadata } from "next";
import { TaskList } from "./task-list";

export const metadata: Metadata = { title: "My tasks", robots: { index: false, follow: false } };

export default function TasksPage() {
  return <TaskList />;
}
