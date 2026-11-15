import React from 'react';
import PropTypes from 'prop-types';
import MicIcon from 'material-ui/svg-icons/av/mic';
import MicOffIcon from 'material-ui/svg-icons/av/mic-off';
import VideoCamIcon from 'material-ui/svg-icons/av/videocam';
import VideoCamOffIcon from 'material-ui/svg-icons/av/videocam-off';
import classnames from 'classnames';
import Logger from '../Logger';

const logger = new Logger('MediaToggles');

// Quick audio / video switches used when placing or answering a call.
// They only reflect the settings in `media`; the caller decides when to save.
export default class MediaToggles extends React.Component
{
	render()
	{
		const props = this.props;
		const media = props.media;

		return (
			<div data-component='MediaToggles'>
				<div
					className={classnames('toggle', { off: !media.audio })}
					title={media.audio ? 'Audio enabled' : 'Audio disabled'}
					onClick={this.handleClickAudio.bind(this)}
				>
					<If condition={media.audio}>
						<MicIcon color='#000'/>
					</If>
					<If condition={!media.audio}>
						<MicOffIcon color='#e53935'/>
					</If>
					<span className='label'>Audio</span>
				</div>

				<div
					className={classnames('toggle', { off: !media.video })}
					title={media.video ? 'Video enabled' : 'Video disabled'}
					onClick={this.handleClickVideo.bind(this)}
				>
					<If condition={media.video}>
						<VideoCamIcon color='#000'/>
					</If>
					<If condition={!media.video}>
						<VideoCamOffIcon color='#e53935'/>
					</If>
					<span className='label'>Video</span>
				</div>
			</div>
		);
	}

	handleClickAudio()
	{
		if (this.props.disabled)
			return;

		logger.debug('handleClickAudio()');

		this.props.onChange({ audio: !this.props.media.audio });
	}

	handleClickVideo()
	{
		if (this.props.disabled)
			return;

		logger.debug('handleClickVideo()');

		this.props.onChange({ video: !this.props.media.video });
	}
}

MediaToggles.propTypes =
{
	media    : PropTypes.object.isRequired,
	disabled : PropTypes.bool,
	onChange : PropTypes.func.isRequired
};
