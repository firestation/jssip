import clone from 'clone';
import deepmerge from 'deepmerge';
import Logger from './Logger';

import storage from './storage';

const logger = new Logger('settingsManager');

const DEFAULT_SIP_DOMAIN = 'tryit.jssip.net';
const DEFAULT_SETTINGS =
{
	'display_name' : null,
	uri            : null,
	password       : null,
	socket         :
	{
		uri             : 'wss://tryit.jssip.net:10443',
		'via_transport' : 'auto'
	},
	'registrar_server'    : null,
	'contact_uri'         : null,
	'authorization_user'  : null,
	'instance_id'         : null,
	'session_timers'      : true,
	'use_preloaded_route' : false,
	'iceMode'             : 'standard',
	ice                   :
	{
		// завершать сбор ICE по первому srflx (а не ждать полную сборку)
		releaseOnSrflx : true,
		// сколько мс ждать кандидатов, прежде чем прервать звонок
		gatherTimeout  : 4000
	},
	pcConfig :
	{
		'rtcpMuxPolicy'      : 'negotiate',
		'iceTransportPolicy' : 'all',
		iceServers           :
		[
			{ urls: [ 'stun:stun.l.google.com:19302' ] }
		]
	},
	media :
	{
		audio       : true,
		video       : true,
		audioDevice : null,
		videoDevice : null
	},
	callstats :
	{
		enabled   : false,
		AppID     : null,
		AppSecret : null
	}
};

// Настройки старых версий не содержат media/iceTransportPolicy — дополняем
function migrate(settings)
{
	if (!settings || typeof settings !== 'object')
		return clone(DEFAULT_SETTINGS, false);

	if (!settings.pcConfig || typeof settings.pcConfig !== 'object')
		settings.pcConfig = clone(DEFAULT_SETTINGS.pcConfig, false);

	if (!settings.pcConfig['iceTransportPolicy'])
		settings.pcConfig['iceTransportPolicy'] = 'all';

	if (!Array.isArray(settings.pcConfig.iceServers))
		settings.pcConfig.iceServers = clone(DEFAULT_SETTINGS.pcConfig.iceServers, false);

	const media = settings.media && typeof settings.media === 'object' ? settings.media : {};

	settings.media =
	{
		audio       : media.audio !== false,
		video       : media.video !== false,
		audioDevice : media.audioDevice || null,
		videoDevice : media.videoDevice || null
	};

	if (settings.iceMode !== 'stun-only')
		settings.iceMode = 'standard';

	const ice = settings.ice && typeof settings.ice === 'object' ? settings.ice : {};
	const timeout = Number(ice.gatherTimeout);

	settings.ice =
	{
		releaseOnSrflx : ice.releaseOnSrflx === undefined ?
			true : Boolean(ice.releaseOnSrflx),
		gatherTimeout : Number.isFinite(timeout) && timeout >= 0 ?
			Math.min(Math.max(timeout, 500), 60000) : 4000
	};

	if (!settings.callstats || typeof settings.callstats !== 'object')
		settings.callstats = clone(DEFAULT_SETTINGS.callstats, false);

	return settings;
}

let settings;

// First, read settings from local storage
settings = storage.get();

if (settings)
{
	logger.debug('settings found in local storage');

	settings = migrate(settings);
}

// Try to read settings from a global SETTINGS object
if (window.SETTINGS)
{
	logger.debug('window.SETTINGS found');

	settings = deepmerge(
		window.SETTINGS,
		settings || {},
		{ arrayMerge: (destinationArray, sourceArray) => sourceArray });
}

// If not settings are found, clone default ones
if (!settings)
{
	logger.debug('no settings found, using default ones');

	settings = clone(DEFAULT_SETTINGS, false);
}

// После слияния с window.SETTINGS могли появиться записи без media/pcConfig
settings = migrate(settings);

module.exports =
{
	get()
	{
		return settings;
	},

	set(newSettings)
	{
		newSettings = migrate(clone(newSettings, false));

		storage.set(newSettings);
		settings = newSettings;
	},

	clear()
	{
		storage.clear();
		settings = clone(DEFAULT_SETTINGS, false);
	},

	// Идентификаторы вкладки: у каждой вкладки свои настройки и свой клиент
	tabId()
	{
		return storage.tabId();
	},

	tabUuid()
	{
		return storage.tabUuid();
	},

	isReady()
	{
		return Boolean(settings.uri);
	},

	getDefaultDomain()
	{
		return DEFAULT_SIP_DOMAIN;
	}
};
