import React from 'react';
import callLogger from '../callLogger';

const FIELDS =
[
	{ key: 'level', label: 'уровень микрофона' },
	{ key: 'inPkt', label: 'входящих пакетов' },
	{ key: 'outPkt', label: 'исходящих пакетов' },
	{ key: 'lost', label: 'потери' },
	{ key: 'jitter', label: 'jitter' },
	{ key: 'rttMs', label: 'RTT, мс' }
];

// Окно качества звонка: последний срез метрик и найденные проблемы
export default class QualityPanel extends React.Component
{
	constructor(props)
	{
		super(props);

		this.state =
		{
			last     : null,
			problems : [],
			open     : true
		};
	}

	render()
	{
		const state = this.state;

		if (!state.open)
			return null;

		return (
			<div data-component='QualityPanel'>
				<div className='header'>
					<span>Качество звонка</span>
					<span className='actions'>
						<span
							className='clear'
							title='Очистить показатели'
							onClick={this.handleClear.bind(this)}
						>
							Очистить
						</span>
						<span
							className='close'
							title='Скрыть'
							onClick={() => this.setState({ open: false })}
						>
							×
						</span>
					</span>
				</div>

				{state.problems.map((problem, index) => (
					<div key={index} className='problem'>{problem}</div>
				))}

				{state.last ? FIELDS.map((field) => (
					<div key={field.key} className='row'>
						<span className='label'>{field.label}</span>
						<span className='value'>{String(state.last[field.key])}</span>
					</div>
				)) : null}

				<If condition={!state.problems.length && !state.last}>
					<div className='row'>Ожидание данных...</div>
				</If>
			</div>
		);
	}

	componentDidMount()
	{
		this._mounted = true;
		this._sync();

		this._timer = setInterval(() => this._sync(), 1000);
	}

	componentWillUnmount()
	{
		this._mounted = false;
		clearInterval(this._timer);
	}

	// Очистить показатели и найденные проблемы
	handleClear()
	{
		this.setState({ last: null, problems: [] });

		callLogger.clearQuality();
		callLogger.log('quality_cleared', {});
	}

	_sync()
	{
		if (!this._mounted)
			return;

		const entries = callLogger.entries || [];
		let last = null;
		// Активные проблемы: key -> текст; снимаются, когда метрика в норме
		const active = new Map();

		for (const entry of entries)
		{
			if (entry.event === 'quality')
			{
				last = entry.data;
			}
			else if (entry.event === 'quality_problem')
			{
				const data = entry.data || {};

				if (data.active === false)
					active.delete(data.key);
				else
					active.set(data.key, data.text);
			}
			else if (entry.event === 'quality_cleared')
			{
				active.clear();
			}
		}

		const problems = Array.from(active.values());

		// Сравниваем содержимое: объект из журнала может быть тем же по ссылке
		const lastJson = JSON.stringify(last);
		const problemsJson = JSON.stringify(problems);

		if (lastJson !== this._lastJson || problemsJson !== this._problemsJson)
		{
			this._lastJson = lastJson;
			this._problemsJson = problemsJson;
			this.setState({ last, problems });
		}
	}
}
