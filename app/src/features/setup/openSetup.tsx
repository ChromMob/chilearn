import { openSheet } from '../../ui/Primitives';
import { SetupCheck } from './SetupCheck';
export function openSetup() { openSheet({ title: 'Check your setup', wide: true, body: close => <SetupCheck onDone={close} compact /> }); }
