import TaskListPage from "../components/TaskListPage.jsx";
import { toDateInputValue } from "../../../lib/date.js";

// Running goals, plus open roadmap goals whose deadline passed (their overdue tasks still count).
const isOngoing = (goal) => goal.isOngoing || (!goal.completedAt && goal.progress?.basis === "roadmap");

// Daily tasks while their goal runs. Roadmap tasks: scheduled today, overdue (pending), or
// completed today — never upcoming ones.
const isForTodayTask = (task, today, goal) => {
  if (!task.isRoadmap) return goal.isOngoing;
  if (task.roadmapStatus === "today" || task.roadmapStatus === "pending") return true;
  return task.roadmapStatus === "completed" && toDateInputValue(task.completedAt) === today;
};

// Due today, plus unfinished to-dos from earlier days; finished ones stay visible on the day they were done.
const isForToday = (todo, today) => {
  if (!todo.dueDate || !today || todo.dueDate > today) return false;
  if (!todo.completedToday) return true;
  return todo.dueDate === today || toDateInputValue(todo.completedAt) === today;
};

function TodayPage() {
  return (
    <TaskListPage
      title="Today"
      includeGoal={isOngoing}
      includeTodo={isForToday}
      includeTask={isForTodayTask}
      emptyTitle="Nothing to do today"
      emptyDescription="Add a to-do for today. Tasks of your goals also show up here while the goal is running."
      groupStateKey="today.groups"
    />
  );
}

export default TodayPage;
