import Log from "./Helper/Log";
import TM from "./Helper/TM/TM";
import Utils from "./Helper/Utils";
const { isAdmin } = Utils;

Log.clear();

!isAdmin && Log.crash("Script needs to be run as Admin");

(async () => {
    const tm = await TM("tm-mb-app-TeamsMgrBack.azurewebsites.net");
    // const tm = await TM("tmmigrationprod.azurewebsites.net");
})();
