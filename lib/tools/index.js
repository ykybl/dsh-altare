/**
 * 工具构造器与注册顺序。
 * @module dsh-altare/tools
 */
import { appsTool } from './apps.js';
import { backupsTool } from './backups.js';
import { deploysTool } from './deploys.js';
import { filesTool } from './files.js';
import { jobsTool } from './jobs.js';
import { logsTool } from './logs.js';
import { networkTool } from './network.js';
import { rawTool } from './raw.js';
import { schedulesTool } from './schedules.js';
import { snapshotsTool } from './snapshots.js';
import { teamTool } from './team.js';
import { variablesTool } from './variables.js';
import { whoamiTool } from './whoami.js';

/** 工具构造器，顺序即模型看到的顺序。 */
export const TOOL_BUILDERS = [
    whoamiTool,
    appsTool,
    deploysTool,
    logsTool,
    filesTool,
    variablesTool,
    backupsTool,
    snapshotsTool,
    networkTool,
    jobsTool,
    schedulesTool,
    teamTool,
    rawTool,
];

/** 用一个运行时构造全部工具定义（测试与自检用）。 */
export function createTools(runtime) {
    return TOOL_BUILDERS.map(build => build(runtime));
}
