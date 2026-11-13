import { installDevelopmentPerformanceGuard } from "@/lib/client/development-performance";
if(process.env.NODE_ENV==="development"&&typeof performance!=="undefined")installDevelopmentPerformanceGuard(performance);
