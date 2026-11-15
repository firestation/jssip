import React from 'react';
import PropTypes from 'prop-types';
import HangUpIcon from 'material-ui/svg-icons/communication/call-end';
import PauseIcon from 'material-ui/svg-icons/av/pause-circle-outline';
import ResumeIcon from 'material-ui/svg-icons/av/play-circle-outline';
import MicIcon from 'material-ui/svg-icons/av/mic';
import MicOffIcon from 'material-ui/svg-icons/av/mic-off';
import classnames from 'classnames';
import JsSIP from 'jssip';
import Logger from '../Logger';
import callLogger from '../callLogger';
import TransitionAppear from './TransitionAppear';

const logger = new Logger('Session');

export default class Session extends React.Component
{
	constructor(props)
	{
		super(props);

		this.state =
		{
			localHasVideo  : false,
			remoteHasVideo : false,
			localHold      : false,
			remoteHold     : false,
			canHold        : false,
			ringing        : false,
			micMuted       : false
		};

		// Mounted flag
		this._mounted = false;
		// Local cloned stream
		this._localClonedStream = null;
	}

	render()
	{
		const state = this.state;
		const props = this.props;
		let noRemoteVideo;

		if (props.session.isInProgress() && !state.ringing)
			noRemoteVideo = <div className='message'>connecting ...</div>;
		else if (state.ringing)
			noRemoteVideo = <div className='message'>ringing ...</div>;
		else if (state.localHold && state.remoteHold)
			noRemoteVideo = <div className='message'>both hold</div>;
		else if (state.localHold)
			noRemoteVideo = <div className='message'>local hold</div>;
		else if (state.remoteHold)
			noRemoteVideo = <div className='message'>remote hold</div>;
		else if (!state.remoteHasVideo)
			noRemoteVideo = <div className='message'>no remote video</div>;

		return (
			<TransitionAppear duration={1000}>
				<div data-component='Session'>
					<video
						ref='localVideo'
						className={classnames('local-video', { hidden: !state.localHasVideo })}
						autoPlay
						muted
					/>

					<video
						ref='remoteVideo'
						className={classnames('remote-video', { hidden: noRemoteVideo })}
						autoPlay
					/>

					<If condition={noRemoteVideo}>
						<div className='no-remote-video-info'>
							{noRemoteVideo}
						</div>
					</If>

					<div className='controls-container'>
						<div className='controls'>
							{/* Выключение микрофона — отдельной кнопкой выше сброса/паузы */}
							<div
								className={classnames('control mic-toggle',
									{ muted: state.micMuted })}
								title={state.micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
								onClick={this.handleToggleMic.bind(this)}
							>
								<If condition={state.micMuted}>
									<MicOffIcon color='#ff5252'/>
								</If>
								<If condition={!state.micMuted}>
									<MicIcon color='#fff'/>
								</If>
							</div>

							<HangUpIcon
								className='control'
								color={'#fff'}
								onClick={this.handleHangUp.bind(this)}
							/>

							<Choose>
								<When condition={!state.localHold}>
									<PauseIcon
										className='control'
										color={'#fff'}
										onClick={this.handleHold.bind(this)}
									/>
								</When>

								<Otherwise>
									<ResumeIcon
										className='control'
										color={'#fff'}
										onClick={this.handleResume.bind(this)}
									/>
								</Otherwise>
							</Choose>
						</div>
					</div>
				</div>
			</TransitionAppear>
		);
	}

	componentDidMount()
	{
		logger.debug('componentDidMount()');

		this._mounted = true;

		const localVideo = this.refs.localVideo;
		const session = this.props.session;
		const peerconnection = session.connection;
		const localStream = peerconnection.getLocalStreams()[0];
		const remoteStream = peerconnection.getRemoteStreams()[0];

		// Handle local stream
		if (localStream)
		{
			// Clone local stream
			this._localClonedStream = localStream.clone();

			// Display local stream
			localVideo.srcObject = this._localClonedStream;

			setTimeout(() =>
			{
				if (!this._mounted)
					return;

				if (localStream.getVideoTracks()[0])
					this.setState({ localHasVideo: true });
			}, 1000);
		}

		// If incoming all we already have the remote stream
		if (remoteStream)
		{
			logger.debug('already have a remote stream');

			this._handleRemoteStream(remoteStream);
		}

		if (session.isEstablished())
		{
			setTimeout(() =>
			{
				if (!this._mounted)
					return;

				this.setState({ canHold: true });
			});
		}

		session.on('progress', (data) =>
		{
			if (!this._mounted)
				return;

			logger.debug('session "progress" event [data:%o]', data);

			if (session.direction === 'outgoing')
				this.setState({ ringing: true });
		});

		session.on('accepted', (data) =>
		{
			if (!this._mounted)
				return;

			logger.debug('session "accepted" event [data:%o]', data);

			if (session.direction === 'outgoing')
			{
				this.props.onNotify(
					{
						level : 'success',
						title : 'Call answered'
					});
			}

			this.setState({ canHold: true, ringing: false });
		});

		session.on('failed', (data) =>
		{
			if (!this._mounted)
				return;

			logger.debug('session "failed" event [data:%o]', data);

			this.props.onNotify(
				{
					level   : 'error',
					title   : 'Call failed',
					message : `Cause: ${data.cause}`
				});

			if (session.direction === 'outgoing')
				this.setState({ ringing: false });
		});

		session.on('ended', (data) =>
		{
			if (!this._mounted)
				return;

			logger.debug('session "ended" event [data:%o]', data);

			this.props.onNotify(
				{
					level   : 'info',
					title   : 'Call ended',
					message : `Cause: ${data.cause}`
				});

			if (session.direction === 'outgoing')
				this.setState({ ringing: false });
		});

		session.on('hold', (data) =>
		{
			if (!this._mounted)
				return;

			const originator = data.originator;

			logger.debug('session "hold" event [originator:%s]', originator);

			switch (originator)
			{
				case 'local':
					this.setState({ localHold: true });
					break;
				case 'remote':
					this.setState({ remoteHold: true });
					break;
			}
		});

		session.on('unhold', (data) =>
		{
			if (!this._mounted)
				return;

			const originator = data.originator;

			logger.debug('session "unhold" event [originator:%s]', originator);

			switch (originator)
			{
				case 'local':
					this.setState({ localHold: false });
					break;
				case 'remote':
					this.setState({ remoteHold: false });
					break;
			}
		});

		peerconnection.addEventListener('addstream', (event) =>
		{
			logger.debug('peerconnection "addstream" event');

			if (!this._mounted)
			{
				logger.error('_handleRemoteStream() | component not mounted');

				return;
			}

			this._handleRemoteStream(event.stream);
		});
	}

	componentWillUnmount()
	{
		logger.debug('componentWillUnmount()');

		this._mounted = false;
		JsSIP.Utils.closeMediaStream(this._localClonedStream);
	}

	handleHangUp()
	{
		logger.debug('handleHangUp()');

		this.props.session.terminate();
	}

	// Включение/выключение микрофона: track.enabled — без пересогласования SDP
	handleToggleMic()
	{
		const session = this.props.session;
		const pc = session && session.connection;
		const senders = pc && pc.getSenders ? pc.getSenders() : [];
		const audio = senders.find((item) => item.track && item.track.kind === 'audio');

		if (!audio || !audio.track)
			return;

		const enabled = !audio.track.enabled;

		audio.track.enabled = enabled;

		logger.debug('handleToggleMic() [enabled:%s]', enabled);

		callLogger.log('mic_toggle', { enabled });
		this.setState({ micMuted: !enabled });
	}

	handleHold()
	{
		logger.debug('handleHold()');

		this.props.session.hold({ useUpdate: true });
	}

	handleResume()
	{
		logger.debug('handleResume()');

		this.props.session.unhold({ useUpdate: true });
	}

	_handleRemoteStream(stream)
	{
		logger.debug('_handleRemoteStream() [stream:%o]', stream);

		const remoteVideo = this.refs.remoteVideo;

		// Display remote stream
		remoteVideo.srcObject = stream;

		this._checkRemoteVideo(stream);

		stream.addEventListener('addtrack', (event) =>
		{
			const track = event.track;

			if (remoteVideo.srcObject !== stream)
				return;

			logger.debug('remote stream "addtrack" event [track:%o]', track);

			// Refresh remote video
			remoteVideo.srcObject = stream;

			this._checkRemoteVideo(stream);

			track.addEventListener('ended', () =>
			{
				logger.debug('remote track "ended" event [track:%o]', track);
			});
		});

		stream.addEventListener('removetrack', () =>
		{
			if (remoteVideo.srcObject !== stream)
				return;

			logger.debug('remote stream "removetrack" event');

			// Refresh remote video
			remoteVideo.srcObject = stream;

			this._checkRemoteVideo(stream);
		});
	}

	_checkRemoteVideo(stream)
	{
		if (!this._mounted)
		{
			logger.error('_checkRemoteVideo() | component not mounted');

			return;
		}

		const videoTrack = stream.getVideoTracks()[0];

		this.setState({ remoteHasVideo: Boolean(videoTrack) });
	}
}

Session.propTypes =
{
	session            : PropTypes.object.isRequired,
	onNotify           : PropTypes.func.isRequired,
	onHideNotification : PropTypes.func.isRequired
};
