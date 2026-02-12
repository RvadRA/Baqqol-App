import Navbar from "./Navbar";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <div className="min-h-screen  bg-gradient-to-br from-gray-900 via-slate-900 to-indigo-900">
      <Navbar />
      <main className=" pb-0 "> {/* Add padding for mobile bottom nav */}
        <Outlet />
      </main>
    </div>
  );
}