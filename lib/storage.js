import Logger from './Logger';

const logger = new Logger('storage');

// Настройки у каждой вкладки свои. localStorage общий на весь origin, поэтому
// две вкладки перетирали друг друга. Теперь рабочий набор вкладки лежит в
// sessionStorage (он у каждой вкладки отдельный), а localStorage используется
// только как «база», с которой стартует новая вкладка.
const TAB_KEY = 'jssip_tab_settings';
const BASE_KEY = 'settings';

function tabStore()
{
	try
	{
		return window.sessionStorage;
	}
	catch (error)
	{
		return null;
	}
}

function newUuid()
{
	// crypto.randomUUID есть не везде, поэтому запасной вариант
	if (window.crypto && typeof window.crypto.randomUUID === 'function')
	{
		try
		{
			return window.crypto.randomUUID();
		}
		catch (error) {}
	}

	const hex = '0123456789abcdef'.split('');
	let out = '';

	for (let i = 0; i < 36; i += 1)
	{
		if (i === 8 || i === 13 || i === 18 || i === 23)
			out += '-';
		else if (i === 14)
			out += '4';
		else if (i === 19)
			out += hex[(Math.random() * 4 | 0) + 8];
		else
			out += hex[Math.random() * 16 | 0];
	}

	return out;
}

// Идентификаторы вкладки: короткий — для журнала, UUID — для instance_id
const TAB_ID = (function()
{
	try
	{
		const store = window.sessionStorage;
		let id = store.getItem('jssip_tab_id');

		if (!id)
		{
			id = `${Date.now().toString(36)}${Math.floor(Math.random() * 100000).toString(36)}`;
			store.setItem('jssip_tab_id', id);
		}

		return id;
	}
	catch (error)
	{
		return null;
	}
})();

const TAB_UUID = (function()
{
	try
	{
		const store = window.sessionStorage;
		let uuid = store.getItem('jssip_tab_uuid');

		if (!uuid)
		{
			uuid = newUuid();
			store.setItem('jssip_tab_uuid', uuid);
		}

		return uuid;
	}
	catch (error)
	{
		return newUuid();
	}
})();

module.exports =
{
	get()
	{
		let data = null;

		try
		{
			const store = tabStore();

			data = store ? store.getItem(TAB_KEY) : null;
		}
		catch (error)
		{
			data = null;
		}

		// Первый запуск во вкладке — стартуем с общих настроек
		if (!data)
		{
			try
			{
				data = window.localStorage.getItem(BASE_KEY);
			}
			catch (error)
			{
				data = null;
			}
		}

		let settings = null;

		if (data)
		{
			try
			{
				settings = JSON.parse(data);
			}
			catch (error)
			{
				logger.warn('get() | повреждённые настройки: %s', error.message);
				settings = null;
			}
		}

		logger.debug('get() [settings:%o]', settings);

		return settings;
	},

	set(settings)
	{
		logger.debug('set() [settings:%o]', settings);

		const json = JSON.stringify(settings);

		try
		{
			const store = tabStore();

			if (store)
				store.setItem(TAB_KEY, json);

			// Общая база тоже обновляется, чтобы новая вкладка открылась
			// с последними настройками
			window.localStorage.setItem(BASE_KEY, json);
		}
		catch (error)
		{
			logger.warn('set() | не удалось сохранить: %s', error.message);
		}
	},

	clear()
	{
		logger.debug('clear()');

		try
		{
			const store = tabStore();

			if (store)
				store.removeItem(TAB_KEY);

			window.localStorage.removeItem(BASE_KEY);
		}
		catch (error)
		{
			logger.warn('clear() | не удалось очистить: %s', error.message);
		}
	},

	// Идентификатор вкладки для журнала
	tabId()
	{
		return TAB_ID;
	},

	// UUID вкладки — JsSIP требует instance_id именно в формате UUID
	tabUuid()
	{
		return TAB_UUID;
	}
};
