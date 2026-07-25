"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBackgroundNode = createBackgroundNode;
exports.createSpriteNode = createSpriteNode;
exports.createDialogueNode = createDialogueNode;
exports.createVideoNode = createVideoNode;
exports.createAudioNode = createAudioNode;
exports.createChoiceNode = createChoiceNode;
exports.createJumpLabelNode = createJumpLabelNode;
exports.createVariableOpNode = createVariableOpNode;
exports.createNodeByType = createNodeByType;
exports.createScene = createScene;
exports.createDefaultProjectMeta = createDefaultProjectMeta;
exports.createEmptyProjectData = createEmptyProjectData;
/**
 * 节点工厂 - 创建各类型节点的默认实例
 */
const uuid_1 = require("uuid");
function createBackgroundNode(position, assetId = '') {
    return {
        id: (0, uuid_1.v4)(),
        type: 'background',
        trackIndex: 0,
        position,
        assetId,
        transition: 'dissolve',
        transitionDuration: 1.0,
        waitForTransition: true,
    };
}
function createSpriteNode(position, characterId = '', emotion = '') {
    return {
        id: (0, uuid_1.v4)(),
        type: 'sprite',
        trackIndex: 1,
        position,
        characterId,
        emotion,
        screenPosition: 'center',
        enterEffect: 'easein',
        exitEffect: 'fadeout',
        zorder: 1,
        visible: true,
    };
}
function createDialogueNode(position, speakerId = null) {
    return {
        id: (0, uuid_1.v4)(),
        type: 'dialogue',
        trackIndex: 2,
        position,
        speakerId,
        text: '',
        textStyle: {
            fontSize: 22,
            fontColor: '#ffffff',
            alignment: 'left',
        },
        typewriterSpeed: 0,
        autoAdvance: false,
        autoAdvanceDelay: 3,
    };
}
function createVideoNode(position, assetId = '') {
    return {
        id: (0, uuid_1.v4)(),
        type: 'video',
        trackIndex: 0,
        position,
        assetId,
        playMode: 'play_and_pause',
        showChoicesOverlay: false,
        skipAllowed: true,
        volume: 100,
    };
}
function createAudioNode(position, assetId = '', audioType = 'bgm') {
    return {
        id: (0, uuid_1.v4)(),
        type: 'audio',
        trackIndex: 3,
        position,
        assetId,
        audioType,
        loop: audioType === 'bgm',
        volume: 80,
        fadeIn: 0,
        fadeOut: 0,
        action: 'play',
    };
}
function createChoiceNode(position) {
    return {
        id: (0, uuid_1.v4)(),
        type: 'choice',
        trackIndex: 4,
        position,
        choices: [
            {
                id: (0, uuid_1.v4)(),
                text: '选项 1',
                targetSceneId: '',
                condition: '',
                variableEffects: [],
            },
        ],
        layout: 'vertical',
        buttonStyle: {
            backgroundColor: '#1e293b',
            textColor: '#ffffff',
            hoverBackgroundColor: '#334155',
            borderRadius: 8,
            fontSize: 18,
        },
    };
}
function createJumpLabelNode(position, subType = 'label') {
    const node = {
        id: (0, uuid_1.v4)(),
        type: 'jump_label',
        trackIndex: 5,
        position,
        subType,
    };
    if (subType === 'label')
        node.labelName = 'label_1';
    if (subType === 'jump')
        node.targetLabel = '';
    return node;
}
function createVariableOpNode(position) {
    return {
        id: (0, uuid_1.v4)(),
        type: 'variable_op',
        trackIndex: 5,
        position,
        variableName: '',
        operation: 'set',
        value: 0,
    };
}
function createNodeByType(type, position) {
    switch (type) {
        case 'background': return createBackgroundNode(position);
        case 'sprite': return createSpriteNode(position);
        case 'dialogue': return createDialogueNode(position);
        case 'video': return createVideoNode(position);
        case 'audio': return createAudioNode(position);
        case 'choice': return createChoiceNode(position);
        case 'jump_label': return createJumpLabelNode(position);
        case 'variable_op': return createVariableOpNode(position);
        default:
            throw new Error(`Unknown node type: ${type}`);
    }
}
function createScene(name) {
    return {
        id: (0, uuid_1.v4)(),
        name,
        nodes: [],
        color: '#3b82f6',
    };
}
function createDefaultProjectMeta(name) {
    const now = new Date().toISOString();
    return {
        version: '1.0',
        name,
        author: '',
        resolution: { width: 1280, height: 720 },
        defaultFont: 'Noto Sans SC',
        themeColor: '#3366CC',
        createdTime: now,
        lastModified: now,
        renpyVersion: '8.2.3',
        sceneOrder: [],
        currentSceneId: null,
    };
}
function createEmptyProjectData(name) {
    const startScene = createScene('start');
    const meta = createDefaultProjectMeta(name);
    meta.sceneOrder = [startScene.id];
    meta.currentSceneId = startScene.id;
    return {
        meta,
        scenes: { [startScene.id]: startScene },
        assets: [],
        characters: [],
        variables: [],
    };
}
//# sourceMappingURL=factory.js.map